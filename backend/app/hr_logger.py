# backend/app/hr_logger.py
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
import os, json, sys, traceback
from .time_utils import now_jst_str

LOG_DIR = Path(__file__).resolve().parents[1] / "logs" / "hr"
LOG_DIR.mkdir(parents=True, exist_ok=True)  # ← ここで必ず作る

CSV_FILE = LOG_DIR / "hr.csv"
JSONL_FILE = LOG_DIR / "hr.jsonl"

LOCAL_TZ = ZoneInfo(os.getenv("APP_TZ", "Asia/Tokyo"))

def log_hr(value, source: str = "rppg", extra: dict | None = None):
    try:
        ts = now_jst_str()
        rec = {"timestamp": ts, "source": source, "hr": value, **(extra or {})}

        if not CSV_FILE.exists():
            CSV_FILE.write_text("timestamp,source,hr\n", encoding="utf-8")
        with CSV_FILE.open("a", encoding="utf-8") as f:
            f.write(f'{ts},{source},{value}\n')

        with JSONL_FILE.open("a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    except Exception as e:
        print("[HR-LOG][ERROR]", e, file=sys.stderr, flush=True)
        traceback.print_exc()
        raise
