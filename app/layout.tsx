import "./globals.css";
import type { Metadata, Viewport } from "next";
import AppBar from "./_components/AppBar";
import BottomTabBar from "./_components/BottomTabBar";

export const metadata: Metadata = {
  title: "FreshGuard",
  description: "냉장고 AI 유통기한 관리 & 레시피 추천",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "FreshGuard" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0f13" },
    { media: "(prefers-color-scheme: light)", color: "#f5f7fa" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

// 하이드레이션 전 테마 적용 — 깜빡임(FOUC) 방지.
// localStorage 'fg-theme' → 시스템 prefers-color-scheme 순.
const THEME_INIT = `
(function(){try{
  var s=localStorage.getItem('fg-theme');
  var t=s==='light'||s==='dark'?s:(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');
  document.documentElement.setAttribute('data-theme',t);
}catch(e){}})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        <div className="app">
          <AppBar />
          <main className="screen">{children}</main>
          <BottomTabBar />
        </div>
      </body>
    </html>
  );
}
