"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { foodEmoji } from "@/lib/foodIcon";
import ManualAddCard from "./_components/ManualAddCard";
import WebcamCapture from "./_components/WebcamCapture";

// 휴대폰이면 OS 카메라(<input capture>), 노트북/데스크톱이면 웹캠 모달로 분기.
function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return true;
  // userAgent 위장 대비: 터치 + 좁은 화면이면 모바일로 간주.
  return (
    window.matchMedia?.("(pointer: coarse)").matches &&
    window.matchMedia?.("(max-width: 900px)").matches
  );
}

type EnrichedItem = {
  label: string;
  quantity: number;
  unit: string;
  confidence: number;
};

type ExpItem = {
  id: string;
  matched_db_key?: string;
  display_name: string;
  category?: string;
  days_left: number;
  quantity: number;
  unit: string;
};

export default function Home() {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<EnrichedItem[]>([]);
  const [saved, setSaved] = useState(0);
  const [expiring, setExpiring] = useState<ExpItem[]>([]);
  const [counts, setCounts] = useState({ total: 0, soon: 0 });
  const [webcamOpen, setWebcamOpen] = useState(false);
  // 마운트 후 환경 감지 (SSR 안전).
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => { setIsMobile(isMobileDevice()); }, []);

  async function loadExpiring() {
    const [r1, r2] = await Promise.all([
      fetch("/api/expiring?days=3").then((r) => r.json()),
      fetch("/api/inventory").then((r) => r.json()),
    ]);
    const exp = (r1.items ?? []) as ExpItem[];
    setExpiring(exp);
    setCounts({
      total: (r2.items ?? []).filter((i: any) => !i.is_consumed).length,
      soon: exp.length,
    });
  }
  useEffect(() => { loadExpiring(); }, []);

  function compressImage(file: File, maxSide = 640, quality = 0.82): Promise<File> {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        if (Math.max(width, height) > maxSide) {
          if (width >= height) {
            height = Math.round((height * maxSide) / width);
            width = maxSide;
          } else {
            width = Math.round((width * maxSide) / height);
            height = maxSide;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(file); return; }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) { resolve(file); return; }
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  async function recognizeBuffer(f: File) {
    setLoading(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("image", f);
      const r = await fetch("/api/recognize", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "recognize failed");
      // FR-05: 인식 직후 기본 개수 1을 부여하여 사용자 조정 가능하게.
      const enriched = (j.items ?? []).map((it: EnrichedItem) => ({
        ...it,
        quantity: it.quantity > 0 ? it.quantity : 1,
      }));
      setItems(enriched);
    } catch (e: any) { setError(e.message ?? String(e)); }
    finally { setLoading(false); }
  }

  // CA-01: 업로드/촬영 직후 자동 인식 시작. 전송 전 640px로 압축.
  async function acceptFile(f: File) {
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setItems([]);
    setError(null);
    setSaved(0);
    const compressed = await compressImage(f);
    recognizeBuffer(compressed);
  }
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    acceptFile(f);
  }

  // 카메라로 찍기:
  //  - 휴대폰: <input capture="environment">로 OS 카메라 호출
  //  - 노트북/데스크톱: getUserMedia 기반 웹캠 모달
  function onCameraClick() {
    if (isMobile) cameraRef.current?.click();
    else setWebcamOpen(true);
  }

  async function saveAll() {
    if (items.length === 0) return;
    setLoading(true);
    try {
      // 같은 라벨은 한 번만 저장하되, 개수는 사용자 입력 합산.
      // 유통기한·카테고리는 저장 시점에 서버가 LLM에 위임해 채움.
      const merged = new Map<string, { display_name: string; quantity: number }>();
      for (const it of items) {
        const key = it.label.trim();
        if (!key) continue;
        const cur = merged.get(key);
        if (cur) cur.quantity += it.quantity;
        else merged.set(key, {
          display_name: key,
          quantity: Math.max(1, Math.round(it.quantity)),
        });
      }
      const r = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: Array.from(merged.values()) }),
      });
      const j = await r.json();
      setSaved((j.created ?? []).length);
      // CA-02: 저장 후에도 사진 미리보기 유지. 새 사진을 선택할 때만 교체.
      setItems([]);
      loadExpiring();
    } finally { setLoading(false); }
  }

  function resetPhoto() {
    if (file && preview) URL.revokeObjectURL(preview);
    setFile(null); setPreview(null); setItems([]); setSaved(0); setError(null);
  }

  function updateItem(idx: number, patch: Partial<EnrichedItem>) {
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeItem(idx: number) {
    setItems((arr) => arr.filter((_, i) => i !== idx));
  }

  const hour = new Date().getHours();
  const greet = hour < 5 ? "늦은 시간이네요" : hour < 12 ? "좋은 아침이에요" : hour < 18 ? "점심 잘 챙기셨어요?" : "오늘 하루 수고하셨어요";

  return (
    <>
      <p className="muted" style={{ margin: "2px 0 4px" }}>{greet}</p>
      <h1>오늘의 냉장고</h1>

      <div className="row" style={{ gap: 8, marginBottom: 14 }}>
        <div className="stat">
          <div className="label">총 재고</div>
          <div className="value">{counts.total}<span className="unit">개</span></div>
        </div>
        <div className="stat" style={{ background: counts.soon > 0 ? "linear-gradient(160deg, rgba(245,165,36,0.18), rgba(245,165,36,0.04))" : undefined }}>
          <div className="label">임박 (D-3)</div>
          <div className="value" style={{ color: counts.soon > 0 ? "var(--warn)" : undefined }}>
            {counts.soon}<span className="unit">개</span>
          </div>
        </div>
      </div>

      {expiring.length > 0 && (
        <div className="card" style={{ borderColor: "rgba(245,165,36,0.5)" }}>
          <div className="row spread" style={{ marginBottom: 8 }}>
            <h2 style={{ margin: 0, color: "var(--warn)" }}>⚠️ 곧 만료돼요</h2>
            <Link href="/recipes" className="badge warn">레시피 받기 →</Link>
          </div>
          <div className="col" style={{ gap: 6 }}>
            {expiring.slice(0, 4).map((it) => {
              const name = it.matched_db_key ?? it.display_name;
              return (
                <div key={it.id} className="row spread" style={{ padding: "6px 0" }}>
                  <div className="row" style={{ gap: 10 }}>
                    <span style={{ fontSize: 24 }}>{foodEmoji(name, it.category)}</span>
                    <div style={{ fontWeight: 600 }}>{name}</div>
                  </div>
                  <span className={`badge ${it.days_left <= 1 ? "danger" : "warn"}`}>
                    D-{Math.max(0, it.days_left)}
                  </span>
                </div>
              );
            })}
            {expiring.length > 4 && (
              <Link href="/fridge" className="tiny" style={{ textAlign: "center", paddingTop: 6 }}>
                {expiring.length - 4}개 더 보기 →
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>📸 사진으로 빠른 등록</h2>
        <p className="muted" style={{ margin: "0 0 12px" }}>
          사진을 고르면 바로 AI 인식이 시작돼요.
        </p>
        {preview && <img src={preview} alt="preview" className="preview" style={{ marginBottom: 12 }} />}

        {!preview && (
          <div className="row" style={{ gap: 8 }}>
            <button className="btn lg" onClick={onCameraClick}>
              📷 카메라로 찍기
            </button>
            <button className="btn lg ghost" onClick={() => fileRef.current?.click()}>
              🖼️ 갤러리
            </button>
          </div>
        )}
        {preview && (
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost" onClick={resetPhoto}>다른 사진 선택</button>
            {!loading && items.length === 0 && file && (
              <button className="btn" onClick={() => recognizeBuffer(file)}>🔁 다시 인식</button>
            )}
          </div>
        )}
        {loading && (
          <div className="row" style={{ gap: 8, marginTop: 10, alignItems: "center" }}>
            <span className="spinner" aria-hidden />
            <p className="muted" style={{ margin: 0 }}>🔍 식재료 인식 중...</p>
          </div>
        )}
        {error && <p style={{ color: "var(--danger)", marginTop: 8 }}>{error}</p>}
        {saved > 0 && <p style={{ color: "var(--accent)", marginTop: 8 }}>✅ {saved}개 등록됨</p>}

        <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={onFile} hidden />
        <input ref={fileRef} type="file" accept="image/*" onChange={onFile} hidden />
      </div>

      {items.length > 0 && (
        <div className="card">
          <div className="row spread" style={{ marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>인식 결과 {items.length}개</h2>
            <button className="btn" onClick={saveAll} disabled={loading}>저장</button>
          </div>
          <p className="tiny">개수와 이름을 확인하고 저장하세요.</p>
          <div className="col" style={{ gap: 8 }}>
            {items.map((it, i) => (
              <div key={i} className="list-item">
                <div className="ico">{foodEmoji(it.label)}</div>
                <div className="meta">
                  <input
                    className="input"
                    value={it.label}
                    style={{ padding: "8px 10px", minHeight: 36, fontSize: 14 }}
                    onChange={(e) => updateItem(i, { label: e.target.value })}
                  />
                  <div className="row" style={{ gap: 6, marginTop: 6, alignItems: "center" }}>
                    {/* FR-05: 인식 결과에도 개수 조정 — 버튼 + 직접 입력 */}
                    <button
                      className="btn ghost"
                      onClick={() => updateItem(i, { quantity: Math.max(1, it.quantity - 1) })}
                      style={{ width: 32, minHeight: 32, padding: 0, fontSize: 16 }}
                      aria-label="decrement"
                    >−</button>
                    <input
                      className="input"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={999}
                      value={it.quantity}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (!Number.isFinite(v)) return;
                        updateItem(i, { quantity: Math.max(1, Math.min(999, Math.round(v))) });
                      }}
                      style={{ width: 52, textAlign: "center", padding: "4px 6px", minHeight: 32, fontSize: 14, fontWeight: 700 }}
                    />
                    <button
                      className="btn ghost"
                      onClick={() => updateItem(i, { quantity: Math.min(999, it.quantity + 1) })}
                      style={{ width: 32, minHeight: 32, padding: 0, fontSize: 16 }}
                      aria-label="increment"
                    >＋</button>
                    <span className="badge warn" style={{ marginLeft: "auto" }}>저장 시 AI가 유통기한 추정</span>
                  </div>
                </div>
                <button className="icon-btn" onClick={() => removeItem(i)} aria-label="remove">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <h2>✍️ 직접 입력</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          식재료 이름을 입력하면 추천 유통기한이 자동으로 표시돼요. 직접 수정도 가능.
        </p>
        <ManualAddCard onAdded={loadExpiring} />
      </div>

      <div className="section">
        <h2>빠른 메뉴</h2>
        <div className="col" style={{ gap: 8 }}>
          <Link href="/fridge" className="list-item">
            <div className="ico">🧊</div>
            <div className="meta">
              <div className="title">냉장고 보기</div>
              <div className="sub">카테고리별 시각화 + 재고 관리</div>
            </div>
            <span className="tiny">→</span>
          </Link>
          <Link href="/recipes" className="list-item">
            <div className="ico">🍳</div>
            <div className="meta">
              <div className="title">레시피 추천 받기</div>
              <div className="sub">임박 재료로 만들 수 있는 메뉴</div>
            </div>
            <span className="tiny">→</span>
          </Link>
          <Link href="/eco" className="list-item">
            <div className="ico">🌱</div>
            <div className="meta">
              <div className="title">에코 임팩트 확인</div>
              <div className="sub">절감한 음식물 쓰레기 · CO₂ · 가계부</div>
            </div>
            <span className="tiny">→</span>
          </Link>
        </div>
      </div>

      <WebcamCapture
        open={webcamOpen}
        onClose={() => setWebcamOpen(false)}
        onCapture={acceptFile}
      />
    </>
  );
}
