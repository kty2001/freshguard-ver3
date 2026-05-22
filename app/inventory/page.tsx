"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// UI-02: 재고 탭은 냉장고 탭에 병합. /inventory 직접 접근은 /fridge로 리다이렉트.
export default function InventoryRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/fridge");
  }, [router]);
  return <p className="muted">냉장고 화면으로 이동 중...</p>;
}
