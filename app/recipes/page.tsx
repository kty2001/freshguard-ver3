"use client";
import { useEffect, useState } from "react";
import { foodEmoji } from "@/lib/foodIcon";

type MenuSuggestion = {
  name: string;
  uses: string[];
  reason: string;
  category?: string;
};

type ExpItem = {
  id: string;
  matched_db_key?: string;
  display_name: string;
  category?: string;
  days_left: number;
};

type InvItem = {
  id: string;
  matched_db_key?: string;
  display_name: string;
  category?: string;
  is_consumed: boolean;
};

const CATEGORY_EMOJI: Record<string, string> = {
  "찌개": "🍲", "국": "🍜", "볶음": "🍳", "구이": "🔥", "조림": "🍲",
  "무침": "🥗", "전·부침": "🥞", "전": "🥞", "샐러드": "🥗",
  "면": "🍜", "밥": "🍚", "반찬": "🍱",
};

function nameOf<T extends { matched_db_key?: string; display_name: string }>(it: T) {
  return it.matched_db_key ?? it.display_name;
}

export default function RecipesPage() {
  const [menus, setMenus] = useState<MenuSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ model?: string; elapsed_ms?: number; expiring_count?: number }>({});
  const [raw, setRaw] = useState("");

  // RE-05: 임박(D-3 이내) 재료 선택 UI.
  const [expiring, setExpiring] = useState<ExpItem[]>([]);
  const [inventory, setInventory] = useState<InvItem[]>([]);
  const [mustUse, setMustUse] = useState<Set<string>>(new Set());

  async function loadCtx() {
    const [r1, r2] = await Promise.all([
      fetch("/api/expiring?days=3").then((r) => r.json()),
      fetch("/api/inventory").then((r) => r.json()),
    ]);
    setExpiring(r1.items ?? []);
    setInventory((r2.items ?? []).filter((i: InvItem) => !i.is_consumed));
  }
  useEffect(() => { loadCtx(); }, []);

  function toggleMust(name: string) {
    setMustUse((s) => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function run() {
    setLoading(true); setError(null); setMenus([]);
    try {
      const r = await fetch("/api/recipes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threshold: 3,
          must_use: Array.from(mustUse),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "failed");
      setMenus(j.suggestions ?? []);
      setMeta({ model: j.model, elapsed_ms: j.elapsed_ms, expiring_count: j.expiring_count });
      setRaw(j.raw ?? "");
    } catch (e: any) { setError(e.message ?? String(e)); }
    finally { setLoading(false); }
  }

  // RE-06: 메뉴 카드에서 사용한 재료를 즉시 소비 처리(냉장고 차감).
  async function consumeUsed(ingredientName: string) {
    const target = inventory.find(
      (i) => nameOf(i) === ingredientName
    );
    if (!target) return false;
    const r = await fetch("/api/inventory/consume", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: target.id, kind: "eaten" }),
    });
    if (!r.ok) return false;
    await loadCtx();
    // 임박 목록에서 선택 해제(이미 사용했으므로).
    setMustUse((s) => {
      const next = new Set(s);
      next.delete(ingredientName);
      return next;
    });
    return true;
  }

  return (
    <>
      <h1>오늘 뭐 먹지?</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        냉장고 재고로 만들 수 있는 메뉴 5가지를 AI가 추천해줘요. 조리법은 카드의 검색 링크에서 확인하세요.
      </p>

      {/* RE-05: 임박 재료 선택 UI */}
      {expiring.length > 0 && (
        <div className="card" style={{ borderColor: "rgba(245,165,36,0.4)" }}>
          <div className="row spread" style={{ marginBottom: 8 }}>
            <h2 style={{ margin: 0, fontSize: 15, color: "var(--warn)" }}>⚠️ 임박 재료 (D-3)</h2>
            <span className="tiny">선택하면 모든 추천에 포함</span>
          </div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {expiring.map((it) => {
              const name = nameOf(it);
              const on = mustUse.has(name);
              return (
                <button
                  key={it.id}
                  onClick={() => toggleMust(name)}
                  className={on ? "btn" : "btn ghost"}
                  style={{ padding: "6px 10px", fontSize: 12, minHeight: 32 }}
                  title={`D-${it.days_left}`}
                >
                  <span style={{ marginRight: 4 }}>{foodEmoji(name, it.category)}</span>
                  {name}
                  <span className="tiny" style={{ marginLeft: 6 }}>D-{Math.max(0, it.days_left)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="card">
        {/* RE-04: 추천 5개 고정 — 개수 선택 UI 제거.
            RE-02/03: 조리시간/인분 입력 제거. */}
        <button className="btn lg" disabled={loading} onClick={run}>
          {loading ? "🍳 메뉴 고르는 중..." : "✨ 메뉴 5개 추천 받기"}
        </button>
        {mustUse.size > 0 && (
          <p className="tiny" style={{ marginTop: 8 }}>
            선택한 재료 {mustUse.size}종을 모든 메뉴에 포함합니다.
          </p>
        )}
        {meta.model && !loading && (
          <p className="tiny" style={{ marginTop: 8 }}>
            {meta.model} · 임박 {meta.expiring_count}개 · {((meta.elapsed_ms || 0) / 1000).toFixed(1)}초
          </p>
        )}
        {error && <p style={{ color: "var(--danger)", marginTop: 8 }}>오류: {error}</p>}
      </div>

      {/* RE-08: 로딩 이펙트 — 스켈레톤 카드 */}
      {loading && (
        <div className="col" style={{ gap: 10 }}>
          {[0, 1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {!loading && menus.length > 0 && (
        <div className="col" style={{ gap: 10 }}>
          {menus.map((m, i) => (
            <MenuCard
              key={i}
              menu={m}
              idx={i}
              inventoryNames={new Set(inventory.map(nameOf))}
              onConsume={consumeUsed}
            />
          ))}
        </div>
      )}

      {!loading && menus.length === 0 && !raw && (
        <div className="empty">
          <div className="ico">🍳</div>
          <div>버튼을 눌러 메뉴를 추천받아 보세요</div>
        </div>
      )}

      {!loading && menus.length === 0 && raw && (
        <div className="card">
          <h2>LLM 원본 응답 (파싱 실패)</h2>
          <pre style={{ whiteSpace: "pre-wrap", background: "var(--panel-2)", padding: 10, borderRadius: 8, fontSize: 11 }}>
            {raw}
          </pre>
        </div>
      )}
    </>
  );
}

function SkeletonCard() {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
        <div className="skeleton" style={{ width: 52, height: 52, borderRadius: 14 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ width: "60%", height: 16, borderRadius: 4, marginBottom: 8 }} />
          <div className="skeleton" style={{ width: "40%", height: 12, borderRadius: 4, marginBottom: 10 }} />
          <div className="skeleton" style={{ width: "100%", height: 28, borderRadius: 8 }} />
        </div>
      </div>
    </div>
  );
}

function MenuCard({ menu, idx, inventoryNames, onConsume }: {
  menu: MenuSuggestion;
  idx: number;
  inventoryNames: Set<string>;
  onConsume: (name: string) => Promise<boolean>;
}) {
  const emoji = (menu.category && CATEGORY_EMOJI[menu.category]) ?? "🍽️";
  const naverUrl = `https://search.naver.com/search.naver?query=${encodeURIComponent(menu.name + " 레시피")}`;
  const mangaeUrl = `https://www.10000recipe.com/recipe/list.html?q=${encodeURIComponent(menu.name)}`;
  const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(menu.name + " 레시피")}`;

  const [consumed, setConsumed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  async function consume(name: string) {
    setBusy(name);
    const ok = await onConsume(name);
    setBusy(null);
    if (ok) setConsumed((s) => new Set(s).add(name));
  }

  const visibleUses = menu.uses.filter((u) => !consumed.has(u));

  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14,
          background: "var(--panel-2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 28, flexShrink: 0,
        }}>{emoji}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row spread" style={{ marginBottom: 2 }}>
            <h2 style={{ margin: 0, fontSize: 17 }}>{menu.name}</h2>
            <span className="tiny" style={{ color: "var(--muted-2)" }}>#{idx + 1}</span>
          </div>
          {menu.category && (
            <div className="tiny" style={{ marginBottom: 6 }}>{menu.category}</div>
          )}
          {menu.reason && (
            <div style={{
              fontSize: 13,
              color: "var(--text)",
              background: "rgba(54,211,153,0.08)",
              border: "1px solid rgba(54,211,153,0.18)",
              borderRadius: 8,
              padding: "6px 10px",
              marginBottom: 8,
            }}>💡 {menu.reason}</div>
          )}

          {/* RE-06: 사용한 재료를 결과 카드에서 바로 소비 처리(차감) */}
          {visibleUses.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div className="tiny" style={{ marginBottom: 4 }}>이 메뉴에 쓰는 재료 — 사용한 만큼 ✕로 차감하세요</div>
              <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                {visibleUses.map((u, i) => {
                  const inFridge = inventoryNames.has(u);
                  return (
                    <span
                      key={i}
                      className="badge flat"
                      style={{
                        fontSize: 11, padding: "3px 4px 3px 8px",
                        display: "inline-flex", alignItems: "center", gap: 4,
                        opacity: inFridge ? 1 : 0.5,
                      }}
                      title={inFridge ? "재고에 있음" : "재고에 없음"}
                    >
                      {u}
                      {inFridge && (
                        <button
                          onClick={() => consume(u)}
                          disabled={busy === u}
                          style={{
                            background: "transparent", border: "none",
                            color: "var(--muted-2)", cursor: "pointer",
                            padding: 0, lineHeight: 1, fontSize: 14,
                          }}
                          aria-label={`${u} 사용 완료`}
                        >×</button>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          {visibleUses.length === 0 && menu.uses.length > 0 && (
            <div className="tiny" style={{ marginBottom: 10, color: "var(--accent)" }}>
              ✅ 이 메뉴의 모든 재료를 사용했습니다.
            </div>
          )}

          <div className="row" style={{ gap: 6 }}>
            <a href={naverUrl} target="_blank" rel="noopener" className="btn ghost"
               style={{ padding: "6px 10px", fontSize: 12, minHeight: 32, flex: 1 }}>
              🔍 네이버
            </a>
            <a href={mangaeUrl} target="_blank" rel="noopener" className="btn ghost"
               style={{ padding: "6px 10px", fontSize: 12, minHeight: 32, flex: 1 }}>
              📖 만개의레시피
            </a>
            <a href={youtubeUrl} target="_blank" rel="noopener" className="btn ghost"
               style={{ padding: "6px 10px", fontSize: 12, minHeight: 32, flex: 1 }}>
              ▶ 유튜브
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
