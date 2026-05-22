"""
컨테이너 시작 시 Ollama 준비 대기 및 모델 pull.
main.py 실행 전에 CMD로 호출된다.
"""

import os
import sys
import time
import json
import urllib.request
import urllib.error

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
MODEL = os.environ.get("VLM_MODEL", "qwen2-vl:7b")


def _log(msg: str) -> None:
    print(f"[startup] {msg}", flush=True)


def wait_for_ollama(retries: int = 60, interval: int = 3) -> None:
    url = f"{OLLAMA_HOST}/api/tags"
    for i in range(retries):
        try:
            urllib.request.urlopen(url, timeout=5)
            _log("Ollama 응답 확인.")
            return
        except Exception:
            _log(f"Ollama 대기 중... ({i + 1}/{retries})")
            time.sleep(interval)
    _log("Ollama에 연결할 수 없습니다. 종료합니다.")
    sys.exit(1)


def is_model_available() -> bool:
    try:
        with urllib.request.urlopen(f"{OLLAMA_HOST}/api/tags", timeout=5) as r:
            data = json.load(r)
        names = [m.get("name", "") for m in data.get("models", [])]
        base = MODEL.split(":")[0]
        return any(base in n for n in names)
    except Exception:
        return False


def pull_model() -> None:
    if is_model_available():
        _log(f"모델 {MODEL} 이미 존재합니다.")
        return

    _log(f"모델 {MODEL} 다운로드 시작 (처음 실행 시 수 GB, 수분 소요)...")

    req_data = json.dumps({"name": MODEL}).encode()
    req = urllib.request.Request(
        f"{OLLAMA_HOST}/api/pull",
        data=req_data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=1800) as resp:
            for raw_line in resp:
                line = raw_line.decode().strip()
                if not line:
                    continue
                try:
                    info = json.loads(line)
                    status = info.get("status", "")
                    total = info.get("total", 0)
                    completed = info.get("completed", 0)
                    if total and completed:
                        pct = int(completed / total * 100)
                        print(f"\r[startup] {status} {pct}%   ", end="", flush=True)
                    elif status:
                        print(f"\n[startup] {status}", flush=True)
                except json.JSONDecodeError:
                    pass
        print(flush=True)
        _log(f"모델 {MODEL} 준비 완료.")
    except urllib.error.URLError as e:
        _log(f"Pull 실패: {e} — 서버는 계속 시작합니다.")


if __name__ == "__main__":
    wait_for_ollama()
    pull_model()
