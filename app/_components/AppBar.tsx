"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import ThemeToggle from "./ThemeToggle";

const TITLES: Record<string, string> = {
  "/": "FreshGuard",
  "/fridge": "냉장고",
  "/inventory": "냉장고",
  "/recipes": "레시피",
  "/eco": "에코 임팩트",
  "/settings": "설정",
};

interface AlertItem {
  id: string;
  display_name: string;
  name: string;
  matched_db_key?: string;
  days_left: number;
  message?: string;
}

function displayName(it: AlertItem): string {
  return it.matched_db_key || it.display_name || it.name;
}

// /api/expiring이 message를 못 내려준 구버전 응답 대비.
function fallbackMessage(name: string, d: number): string {
  if (d < 0) return `${name}의 유통기한이 ${Math.abs(d)}일 지났습니다.`;
  if (d === 0) return `${name}의 유통기한이 오늘까지입니다.`;
  return `${name}의 유통기한이 ${d}일 남았습니다.`;
}

export default function AppBar() {
  const path = usePathname() || "/";
  const title = TITLES[path] ?? "FreshGuard";
  const [items, setItems] = useState<AlertItem[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    fetch("/api/expiring?days=3")
      .then((r) => r.json())
      .then((j) => setItems(Array.isArray(j.items) ? j.items : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [path, load]);

  // ESC로 닫기, 열렸을 때 body scroll lock
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const count = items.length;
  const isHome = path === "/";

  return (
    <header className="appbar">
      <div className="row" style={{ gap: 10 }}>
        {!isHome && (
          <button
            className="icon-btn"
            aria-label="back"
            onClick={() => history.back()}
            style={{ marginLeft: -8 }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        <span className="brand">{title}</span>
      </div>
      <div className="actions">
        <ThemeToggle />
        <button
          type="button"
          className="icon-btn"
          aria-label={count > 0 ? `유통기한 임박 ${count}건` : "유통기한 임박 알림 없음"}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => {
            load();
            setOpen(true);
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10 21a2 2 0 004 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {count > 0 && <span className="dot" aria-hidden="true" />}
        </button>
        <Link href="/settings" className="icon-btn" aria-label="settings">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
            <path d="M19.4 15a1.7 1.7 0 00.4 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.4 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.9.4l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.4-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.4-1.9l-.1-.1A2 2 0 116.9 4.2l.1.1a1.7 1.7 0 001.9.4H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.4l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.4 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>

      {open && (
        <div
          className="alert-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="유통기한 임박 알림"
          onClick={() => setOpen(false)}
        >
          <div className="alert-popup" onClick={(e) => e.stopPropagation()}>
            <div className="alert-popup-header">
              <span className="alert-popup-title">
                유통기한 임박 알림{count > 0 ? ` (${count})` : ""}
              </span>
              <button
                type="button"
                className="icon-btn"
                aria-label="닫기"
                onClick={() => setOpen(false)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {count === 0 ? (
              <div className="alert-popup-empty">3일 안에 유통기한이 도래하는 항목이 없습니다.</div>
            ) : (
              <ul className="alert-list">
                {items.map((it) => {
                  const msg = it.message ?? fallbackMessage(displayName(it), it.days_left);
                  const tone =
                    it.days_left < 0 ? "is-over" : it.days_left <= 1 ? "is-urgent" : "";
                  return (
                    <li key={it.id} className={`alert-row push-style ${tone}`}>
                      <span className="alert-bell" aria-hidden="true">🔔</span>
                      <span className="alert-message">{msg}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
