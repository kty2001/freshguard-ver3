"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";

// UI-02: '재고' 탭 삭제 — 냉장고 탭이 재고 기능까지 포괄.
const TABS: { href: string; label: string; icon: string; match: RegExp }[] = [
  { href: "/", label: "홈", icon: "🏠", match: /^\/$/ },
  { href: "/fridge", label: "냉장고", icon: "🧊", match: /^\/(fridge|inventory)/ },
  { href: "/recipes", label: "레시피", icon: "🍳", match: /^\/recipes/ },
  { href: "/eco", label: "에코", icon: "🌱", match: /^\/eco/ },
];

export default function BottomTabBar() {
  const path = usePathname() || "/";
  return (
    <nav className="tabbar" aria-label="primary">
      {TABS.map((t) => {
        const active = t.match.test(path);
        return (
          <Link key={t.href} href={t.href} className={`tab${active ? " active" : ""}`}>
            <span className="icn" aria-hidden>{t.icon}</span>
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
