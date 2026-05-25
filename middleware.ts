import { NextRequest, NextResponse } from "next/server";

// 로그인 게이트: fg_user 쿠키가 없으면 /login 으로 보낸다.
// 인증 API(/api/auth/*), 헬스 체크(/api/health), 그리고 /login 자체는 통과.

const PUBLIC_API_PREFIXES = ["/api/auth/", "/api/health"];
const PUBLIC_PATHS = new Set(["/login"]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const fgUser = req.cookies.get("fg_user")?.value?.trim();

  const isPublicPath = PUBLIC_PATHS.has(pathname);
  const isPublicApi = PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p));

  // 이미 로그인된 사용자가 /login에 오면 홈으로.
  if (pathname === "/login" && fgUser) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (isPublicPath || isPublicApi) {
    return NextResponse.next();
  }

  if (!fgUser) {
    // API 요청이면 401 로, 페이지 요청이면 /login 으로.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    if (pathname !== "/") loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // _next 정적 자산, favicon 은 제외.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
