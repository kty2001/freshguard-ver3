"use client";
import { useEffect, useRef, useState } from "react";
import { foodEmoji } from "@/lib/foodIcon";

type Suggestion = {
  query: string;
  name: string;
  category?: string;
  storage_type: "냉장" | "냉동" | "실온";
  days: number;
  note?: string;
  source: "db" | "llm" | "default" | "rejected";
  matched_db_key?: string;
  is_food: boolean;
  elapsed_ms: number;
};

type Props = {
  onAdded?: () => void;
  inline?: boolean;
};

const SOURCE_LABEL: Record<Suggestion["source"], { text: string; tone: "ok" | "warn" | "flat" | "danger" }> = {
  db: { text: "📚 공식 DB", tone: "ok" },
  llm: { text: "🤖 AI 추정", tone: "warn" },
  default: { text: "🟡 기본값", tone: "flat" },
  rejected: { text: "⛔ 식품 아님", tone: "danger" },
};

export default function ManualAddCard({ onAdded, inline }: Props) {
  const [name, setName] = useState("");
  const [days, setDays] = useState(7);
  // FR-05: 직접 입력 시에도 개수 입력 가능.
  const [quantity, setQuantity] = useState(1);
  // EC-02 (선택): 가격 입력. 비워두면 가계부 미기록.
  const [price, setPrice] = useState<string>("");
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [overridden, setOverridden] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQueriedRef = useRef<string>("");

  useEffect(() => {
    const trimmed = name.trim();
    if (debRef.current) clearTimeout(debRef.current);
    if (!trimmed) {
      setSuggestion(null);
      setOverridden(false);
      return;
    }
    if (trimmed === lastQueriedRef.current) return;
    debRef.current = setTimeout(() => {
      fetchSuggestion(trimmed);
    }, 700);
    return () => {
      if (debRef.current) clearTimeout(debRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  async function fetchSuggestion(q: string) {
    setLoading(true);
    setMsg({});
    try {
      const r = await fetch("/api/expiry/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: q }),
      });
      const j: Suggestion = await r.json();
      lastQueriedRef.current = q;
      setSuggestion(j);
      if (!overridden && j.days > 0) setDays(j.days);
    } catch (e: any) {
      setMsg({ err: e.message ?? String(e) });
    } finally {
      setLoading(false);
    }
  }

  async function add() {
    if (!name.trim()) return;
    // LM-02: 음식 아닌 입력은 저장 차단.
    if (suggestion && suggestion.source === "rejected") {
      setMsg({ err: suggestion.note ?? "식품이 아닌 입력입니다." });
      return;
    }
    setSaving(true); setMsg({});
    try {
      const priceVal = Number(price);
      const r = await fetch("/api/inventory", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: suggestion?.matched_db_key ?? name.trim(),
          manual: true,
          manual_expiry_days: days,
          quantity: Math.max(1, Math.round(quantity)),
          category: suggestion?.category,
          price_krw: Number.isFinite(priceVal) && priceVal > 0 ? priceVal : undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "저장 실패");
      setMsg({ ok: `${name.trim()} ${quantity}개 등록 완료` });
      setName(""); setDays(7); setQuantity(1); setPrice("");
      setSuggestion(null); setOverridden(false);
      lastQueriedRef.current = "";
      onAdded?.();
    } catch (e: any) {
      setMsg({ err: e.message ?? String(e) });
    } finally {
      setSaving(false);
    }
  }

  const cardCls = inline ? "" : "card";
  const finalName = suggestion?.matched_db_key ?? suggestion?.name ?? name;
  const emoji = foodEmoji(finalName, suggestion?.category);
  const rejected = suggestion?.source === "rejected";

  return (
    <div className={cardCls} style={inline ? undefined : { padding: 14 }}>
      {!inline && <h2 style={{ marginTop: 0 }}>✍️ 직접 입력</h2>}

      <input
        className="input"
        placeholder="식재료 이름 (예: 고등어, 두부, 사과)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />

      {name.trim().length > 0 && (
        <div
          className="card flat"
          style={{
            marginTop: 10, padding: 12, marginBottom: 0,
            borderColor: rejected ? "rgba(239,68,68,0.45)" : undefined,
          }}
        >
          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <div
              style={{
                width: 48, height: 48, borderRadius: 12,
                background: "var(--panel)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 26, flexShrink: 0,
              }}
            >{rejected ? "⛔" : emoji}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row" style={{ gap: 6, alignItems: "center" }}>
                <strong style={{ fontSize: 15 }}>{finalName}</strong>
                {suggestion && (
                  <span className={`badge ${SOURCE_LABEL[suggestion.source].tone}`} style={{ fontSize: 10, padding: "1px 7px" }}>
                    {SOURCE_LABEL[suggestion.source].text}
                  </span>
                )}
              </div>
              <div className="tiny" style={{ marginTop: 2 }}>
                {loading
                  ? "🔍 추천 유통기한을 가져오는 중..."
                  : rejected
                    ? (suggestion?.note ?? "식품이 아닙니다")
                    : suggestion
                      ? `${suggestion.category ?? "기타"}${suggestion.note ? ` · ${suggestion.note}` : ""}`
                      : "잠시 후 추천이 표시됩니다"}
              </div>
            </div>
          </div>

          {!rejected && (
            <>
              {/* FR-05: 개수 입력 */}
              <div className="row spread" style={{ marginTop: 14, marginBottom: 4 }}>
                <div className="tiny">개수</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{quantity}개</div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <button
                  className="btn ghost"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  style={{ flex: "0 0 44px", padding: "8px 0", fontSize: 18, minHeight: 38 }}
                  aria-label="decrement"
                >−</button>
                <input
                  className="input"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={999}
                  value={quantity}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    setQuantity(Math.max(1, Math.min(999, Math.round(v))));
                  }}
                  style={{ flex: 1, textAlign: "center", padding: "8px 10px", minHeight: 38, fontSize: 14 }}
                />
                <button
                  className="btn ghost"
                  onClick={() => setQuantity((q) => Math.min(999, q + 1))}
                  style={{ flex: "0 0 44px", padding: "8px 0", fontSize: 18, minHeight: 38 }}
                  aria-label="increment"
                >＋</button>
              </div>

              <div className="row spread" style={{ marginTop: 14, marginBottom: 4 }}>
                <div className="tiny">유통기한 {overridden ? "(수정됨)" : ""}</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{days}일</div>
              </div>
              <input
                type="range"
                min={1}
                max={Math.max(60, days, 90)}
                value={days}
                onChange={(e) => { setDays(Number(e.target.value)); setOverridden(true); }}
                style={{ width: "100%", accentColor: "var(--accent)" }}
              />
              <div className="row" style={{ gap: 6, marginTop: 6 }}>
                {[1, 3, 7, 14, 30, 90].map((d) => (
                  <button
                    key={d}
                    onClick={() => { setDays(d); setOverridden(true); }}
                    className={d === days ? "btn" : "btn ghost"}
                    style={{ flex: 1, padding: "5px 0", fontSize: 11, minHeight: 30 }}
                  >{d}일</button>
                ))}
              </div>

              {/* EC-02: 가격 (선택) */}
              <div className="row spread" style={{ marginTop: 14, marginBottom: 4 }}>
                <div className="tiny">가격 (선택)</div>
                <div className="tiny">가계부에 기록</div>
              </div>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="예: 4500"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                style={{ padding: "8px 10px", minHeight: 38, fontSize: 14 }}
              />

              {suggestion && overridden && (
                <button
                  className="btn ghost"
                  onClick={() => {
                    setDays(suggestion.days);
                    setOverridden(false);
                  }}
                  style={{ width: "100%", marginTop: 10, padding: "8px 0", fontSize: 12, minHeight: 34 }}
                >↺ 추천값으로 되돌리기</button>
              )}
            </>
          )}
        </div>
      )}

      <button
        className="btn lg"
        style={{ marginTop: 12 }}
        disabled={saving || loading || !name.trim() || rejected}
        onClick={add}
      >
        {saving ? "저장 중..." : rejected ? "추가 불가" : "＋ 재고에 추가"}
      </button>

      {msg.ok && <p style={{ color: "var(--accent)", marginTop: 8, fontSize: 13 }}>✅ {msg.ok}</p>}
      {msg.err && <p style={{ color: "var(--danger)", marginTop: 8, fontSize: 13 }}>오류: {msg.err}</p>}
    </div>
  );
}
