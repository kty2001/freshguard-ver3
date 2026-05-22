// ver3: 모든 비전 추론은 원격 VLM 서버에서 수행한다. (lib/vlmServer.ts)
// 본 모듈은 이미지 사전 정규화(EXIF 회전, 크기 제한, JPEG 인코딩) 후
// 서버에 multipart로 위임하는 얇은 래퍼이다.

import sharp from "sharp";
import type { RecognizedItem } from "./types";
import { recognize as remoteRecognize } from "./vlmServer";

// 큰 사진을 그대로 보내면 서버 대역폭과 메모리에 부담 → longest side 제한.
const MAX_SIDE = Number(process.env.VLM_CLIENT_MAX_SIDE ?? 1024);
const JPEG_QUALITY = Number(process.env.VLM_CLIENT_JPEG_QUALITY ?? 82);

async function normalizeImage(input: Buffer): Promise<Buffer> {
  return sharp(input, { failOn: "none" })
    .rotate()
    .resize({
      width: MAX_SIDE,
      height: MAX_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .toColorspace("srgb")
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}

export interface RecognizeResult {
  items: RecognizedItem[];
  raw: string;
  model: string;
  elapsed_ms: number;
  normalized_bytes?: number;
}

export async function recognizeWithVLM(
  imageInput: Buffer | string
): Promise<RecognizeResult> {
  let normalized: Buffer;
  let normalizedBytes = 0;
  if (Buffer.isBuffer(imageInput)) {
    normalized = await normalizeImage(imageInput);
    normalizedBytes = normalized.byteLength;
  } else {
    // 이미 base64인 경우 디코드 후 다시 정규화.
    normalized = await normalizeImage(Buffer.from(imageInput, "base64"));
    normalizedBytes = normalized.byteLength;
  }

  const t0 = Date.now();
  const r = await remoteRecognize(normalized);
  return {
    items: r.items,
    raw: r.raw ?? "",
    model: r.model ?? "vlm-remote",
    elapsed_ms: r.elapsed_ms ?? Date.now() - t0,
    normalized_bytes: normalizedBytes,
  };
}

// 하위 호환: ver2까지 사용되던 이름을 그대로 export.
export const recognizeWithMoondream = recognizeWithVLM;
