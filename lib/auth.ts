// 전화번호 SMS 코드 인증 — 데모/개발용 메모리 스토어.
// 실제 SMS 발송은 외부 게이트웨이(Twilio / NHN Cloud 등) 연동이 필요하지만,
// 현재 빌드에는 미연결. 따라서 send-code 응답에 dev_code 필드로 코드를 함께 내려준다.
// 운영 전 반드시 SMS 게이트웨이로 갈아끼울 것.

const TTL_MS = 5 * 60 * 1000; // 5분
const STORE = new Map<string, { code: string; expires_at: number }>();

export function normalizePhone(raw: string): string {
  const digits = (raw ?? "").replace(/[^0-9]/g, "");
  return digits;
}

export function isValidPhone(raw: string): boolean {
  const n = normalizePhone(raw);
  // 한국 휴대전화: 10~11자리, 01로 시작 (010, 011 등). 그 외 국가는 8~15자리 일반 검증.
  if (/^01\d{8,9}$/.test(n)) return true;
  return n.length >= 8 && n.length <= 15;
}

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function issueCode(phone: string): { code: string; expires_at: number } {
  const code = generateCode();
  const expires_at = Date.now() + TTL_MS;
  STORE.set(phone, { code, expires_at });
  return { code, expires_at };
}

export function verifyCode(phone: string, code: string): { ok: boolean; reason?: string } {
  const entry = STORE.get(phone);
  if (!entry) return { ok: false, reason: "코드를 먼저 요청하세요" };
  if (Date.now() > entry.expires_at) {
    STORE.delete(phone);
    return { ok: false, reason: "코드가 만료되었습니다. 다시 요청하세요" };
  }
  if (entry.code !== code.trim()) return { ok: false, reason: "코드가 일치하지 않습니다" };
  STORE.delete(phone); // 1회용
  return { ok: true };
}

// 클라이언트에 어떤 식으로 코드를 전달할지 결정. 운영에서는 false 권장.
export function devCodeEnabled(): boolean {
  // 기본 활성(개발/데모). NEXT_PUBLIC_DEV_CODE=0 으로 명시적 비활성 가능.
  return (process.env.DEV_AUTH_CODE_RETURN ?? "1") !== "0";
}
