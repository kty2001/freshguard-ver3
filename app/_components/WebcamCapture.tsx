"use client";
// 데스크톱(노트북) 웹캠 촬영 모달.
// 휴대폰에서는 사용하지 않음 — 휴대폰은 <input type="file" capture="environment">로 OS 카메라 사용.

import { useEffect, useRef, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

export default function WebcamCapture({ open, onClose, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setErr(null);
    setReady(false);

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErr("이 브라우저는 카메라 접근을 지원하지 않습니다.");
        return;
      }
      try {
        // 후면 카메라 우선이지만, 노트북은 보통 facingMode 무시되어 기본 웹캠으로 잡힘.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => {});
          setReady(true);
        }
      } catch (e: any) {
        if (e?.name === "NotAllowedError") {
          setErr("카메라 권한이 거부되었습니다. 브라우저 주소창의 카메라 아이콘에서 허용해 주세요.");
        } else if (e?.name === "NotFoundError") {
          setErr("연결된 카메라가 없습니다.");
        } else {
          setErr(e?.message ?? "카메라를 열 수 없습니다.");
        }
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const v = videoRef.current;
      if (v) v.srcObject = null;
    };
  }, [open]);

  // ESC로 닫기.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function snap() {
    const v = videoRef.current;
    if (!v) return;
    const w = v.videoWidth || 1280;
    const h = v.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, w, h);
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92)
    );
    if (!blob) return;
    const file = new File([blob], `webcam-${Date.now()}.jpg`, { type: "image/jpeg" });
    onCapture(file);
    onClose();
  }

  if (!open) return null;

  return (
    <div
      className="webcam-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="웹캠으로 촬영"
      onClick={onClose}
    >
      <div className="webcam-modal" onClick={(e) => e.stopPropagation()}>
        <div className="webcam-header">
          <span className="webcam-title">📷 웹캠 촬영</span>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="webcam-body">
          {err ? (
            <p className="webcam-error">{err}</p>
          ) : (
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="webcam-video"
            />
          )}
        </div>

        <div className="webcam-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="btn"
            onClick={snap}
            disabled={!ready || !!err}
          >
            📸 촬영
          </button>
        </div>
      </div>
    </div>
  );
}
