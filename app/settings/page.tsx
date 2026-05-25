"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [userPhone, setUserPhone] = useState<string>("");

  useEffect(() => {
    // fg_user 쿠키 읽기 (httpOnly 가 아니라 클라이언트에서 접근 가능).
    const m = document.cookie.match(/(?:^|; )fg_user=([^;]+)/);
    if (m) setUserPhone(decodeURIComponent(m[1]));
  }, []);

  function formatPhone(d: string): string {
    if (d.length === 11 && d.startsWith("010")) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
    return d;
  }

  async function logout() {
    if (!confirm("로그아웃하시겠습니까?\n같은 번호로 다시 로그인하면 데이터가 복원됩니다.")) return;
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function clear(scope: "inventory" | "logs" | "all") {
    const txt =
      scope === "inventory" ? "재고 데이터 전체를 삭제할까요?" :
      scope === "logs" ? "소진 이력(에코 데이터)을 삭제할까요?" :
      "재고 + 소진 이력 모두 삭제할까요?";
    if (!confirm(txt + "\n이 작업은 되돌릴 수 없습니다.")) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch(`/api/inventory/all?scope=${scope}`, { method: "DELETE" });
      const j = await r.json();
      setMsg(`✅ 삭제됨: ${(j.cleared ?? []).join(", ") || "없음"}`);
    } finally { setBusy(false); }
  }

  return (
    <>
      <h1>설정</h1>
      <p className="muted" style={{ marginTop: 0 }}>데이터 관리를 할 수 있어요.</p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>👤 계정</h2>
        <div className="row spread" style={{ padding: "6px 0 12px" }}>
          <span className="muted" style={{ fontSize: 13 }}>로그인 번호</span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>
            {userPhone ? formatPhone(userPhone) : "—"}
          </span>
        </div>
        <button className="btn ghost" disabled={busy} onClick={logout} style={{ width: "100%" }}>
          🔓 로그아웃
        </button>
      </div>

      {/* UI-03: 'AI 모델', '데이터 현황' 항목 제거 (사용자 혼란 방지) */}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>🗑️ 데이터 초기화</h2>
        <p className="tiny" style={{ marginBottom: 12 }}>
          삭제한 데이터는 복구할 수 없어요.
        </p>
        <div className="col" style={{ gap: 8 }}>
          <button className="btn ghost" disabled={busy} onClick={() => clear("inventory")}>
            재고 데이터 삭제
          </button>
          <button className="btn ghost" disabled={busy} onClick={() => clear("logs")}>
            에코(소진 이력) 데이터 삭제
          </button>
          <button className="btn danger" disabled={busy} onClick={() => clear("all")}>
            전체 초기화
          </button>
        </div>
        {msg && <p className="muted" style={{ marginTop: 10 }}>{msg}</p>}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>ℹ️ 정보</h2>
        <div className="col" style={{ gap: 0 }}>
          <Field label="버전" value="FreshGuard v0.2 (보완)" />
          <Field label="데이터" value="식약처 고시 + USDA FoodKeeper" />
          <Field label="저장" value="로컬 JSON (오프라인)" />
        </div>
        <p className="tiny" style={{ marginTop: 10 }}>
          이미지는 인식 후 즉시 폐기되며 서버에 저장되지 않습니다.
        </p>
        {/* UI-04: '홈으로', '재고로' 내비게이션 중복 제거 */}
      </div>
    </>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="row spread" style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <span className="muted" style={{ fontSize: 13 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, fontFamily: mono ? "ui-monospace, Menlo, Consolas, monospace" : undefined }}>
        {value}
      </span>
    </div>
  );
}
