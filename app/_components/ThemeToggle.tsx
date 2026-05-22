"use client";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const STORAGE_KEY = "fg-theme";

function getInitialTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "light" ? "light" : "dark";
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(getInitialTheme());
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
  }

  // 사전 하이드레이션 스크립트가 이미 data-theme를 적용해두므로 마운트 전엔 빈 자리만 차지.
  return (
    <button
      className="icon-btn"
      aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
      onClick={toggle}
      title={theme === "dark" ? "라이트 모드" : "다크 모드"}
    >
      {mounted && (theme === "dark" ? (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ) : (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2"/>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      ))}
    </button>
  );
}
