# backend/app/prompt_logger.py
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path
import json
import os
import sys
import traceback
from .time_utils import now_jst_str

BASE_DIR = Path(__file__).resolve().parents[1]
LOG_DIR = BASE_DIR / "logs" / "prompts"
LOG_DIR.mkdir(parents=True, exist_ok=True)

CSV_FILE = LOG_DIR / "prompts.csv"
JSONL_FILE = LOG_DIR / "prompts.jsonl"

LOCAL_TZ = ZoneInfo(os.getenv("APP_TZ", "Asia/Tokyo"))  # JST をデフォルトに

def log_prompt(
    prompt: str,
    src: str,
    hr: float | int | None = None,
    intensity: float | None = None,
    bpm: float | int | None = None,
    duration: int | None = None,
    job_id: str | None = None,
) -> None:
    """
    音楽生成プロンプトを CSV / JSONL / stdout に記録する
    """
    try:
        ts = now_jst_str()

        rec = {
            "timestamp": ts,
            "source": src,
            "prompt": prompt,
            "hr": hr,
            "intensity": intensity,
            "bpm": bpm,
            "duration": duration,
            "job_id": job_id,
        }

        # --- CSV ---
        if not CSV_FILE.exists():
            CSV_FILE.write_text(
                "timestamp,source,prompt,hr,intensity,bpm,duration,job_id\n",
                encoding="utf-8",
            )
        # ダブルクォートを CSV 風にエスケープ
        quoted_prompt = '"' + prompt.replace('"', '""') + '"'
        line = (
            f"{ts},{src},{quoted_prompt},"
            f"{_nv(hr)},{_nv(intensity)},{_nv(bpm)},{_nv(duration)},{_nv(job_id)}\n"
        )
        with CSV_FILE.open("a", encoding="utf-8") as f:
            f.write(line)

        # --- JSONL ---
        with JSONL_FILE.open("a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

        # --- stdout ---
        print(
            f"[PROMPT-LOG] {ts}\t{src}\tHR={hr}\tINT={intensity}\tBPM={bpm}\tDUR={duration}\t{prompt}",
            flush=True,
        )

    except Exception as e:
        print("[PROMPT-LOG][ERROR]", e, file=sys.stderr, flush=True)
        traceback.print_exc()
        raise

def _nv(v):
    return "" if v is None else v
