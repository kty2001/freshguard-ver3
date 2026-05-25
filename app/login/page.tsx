"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const digits = phone.replace(/[^0-9]/g, "");
    if (digits.length < 8) {
      setError("올바른 휴대폰 번호를 입력하세요");
      setLoading(false);
      return;
    }
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digits }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? "로그인 실패");
      router.replace("/");
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1 className="login-title">FreshGuard</h1>
        <p className="login-subtitle">휴대폰 번호로 로그인하세요</p>

        <form onSubmit={submit} className="col" style={{ gap: 12 }}>
          <label className="tiny" style={{ marginBottom: -4 }}>휴대폰 번호</label>
          <input
            type="tel"
            inputMode="tel"
            className="input"
            placeholder="010-1234-5678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn lg" disabled={loading}>
            {loading ? "로그인 중..." : "로그인"}
          </button>
          {error && <p style={{ color: "var(--danger)", margin: 0, fontSize: 13 }}>{error}</p>}
        </form>

        <p className="tiny" style={{ marginTop: 16, opacity: 0.6 }}>
          전화번호는 사용자 식별 용도로만 사용됩니다.<br/>
          같은 번호로 다시 로그인하면 기존 냉장고 데이터가 그대로 복원됩니다.
        </p>
      </div>
    </div>
  );
}
