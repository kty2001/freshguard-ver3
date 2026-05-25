import { NextRequest } from "next/server";
import { DEFAULT_USER_ID } from "./inventory";

// 요청에서 fg_user 쿠키(또는 헤더)를 읽어 데이터 스코프용 userId를 돌려준다.
// 로그인 직후 안드로이드 래퍼가 CookieManager 로 fg_user=<전화번호> 쿠키를 셋한다.
export function getUserId(req: NextRequest): string {
  const fromCookie = req.cookies.get("fg_user")?.value;
  if (fromCookie && fromCookie.trim()) return fromCookie.trim();
  const fromHeader = req.headers.get("x-fg-user");
  if (fromHeader && fromHeader.trim()) return fromHeader.trim();
  return DEFAULT_USER_ID;
}
