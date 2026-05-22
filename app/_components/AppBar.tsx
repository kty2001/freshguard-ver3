"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import ThemeToggle from "./ThemeToggle";

// UI-02: 재고 탭이 사라져 inventory 경로는 메뉴에 노출되지 않지만,
// 직접 URL 접근 대비 타이틀 매핑은 남겨둔다.
const TITLES: Record<string, string> = {
  "/": "FreshGuard",
  "/fridge": "냉장고",
  "/inventory": "냉장고",
  "/recipes": "레시피",
  "/eco": "에코 임팩트",
  "/settings": "설정",
};

export default function AppBar() {
  const path = usePathname() || "/";
  const title = TITLES[path] ?? "FreshGuard";
  const [expiringCount, setExpiringCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/expiring?days=3")
        .then((r) => r.json())
        .then((j) => alive && setExpiringCount((j.items ?? []).length))
        .catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [path]);

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
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
        <span className="brand">{title}</span>
      </div>
      <div className="actions">
        <ThemeToggle />
        <Link href="/fridge" className="icon-btn" aria-label="alerts">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M10 21a2 2 0 004 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          {expiringCount > 0 && <span className="dot" aria-label={`${expiringCount} expiring`} />}
        </Link>
        <Link href="/settings" className="icon-btn" aria-label="settings">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
            <path d="M19.4 15a1.7 1.7 0 00.4 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.4 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.9.4l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.4-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.4-1.9l-.1-.1A2 2 0 116.9 4.2l.1.1a1.7 1.7 0 001.9.4H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.4l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.4 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>
      </div>
    </header>
  );
}
