# backend/app/time_utils.py
from datetime import datetime
from zoneinfo import ZoneInfo
import os

LOCAL_TZ = ZoneInfo(os.getenv("APP_TZ", "Asia/Tokyo"))

def now_jst_str() -> str:
    """YYYY-MM-DD HH:MM:SS（JST）"""
    return datetime.now(LOCAL_TZ).strftime("%Y-%m-%d %H:%M:%S")
