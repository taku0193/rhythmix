# app/music_job_router.py
import asyncio
import uuid
from typing import Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from .prompt_logger import log_prompt 

# ★修正点: グローバル変数をインポートしない
from .music_prompt_utils import (
    generate_wav_np,
    save_wav_and_estimate_bpm,
    build_prompt,
)

router = APIRouter()

# シンプルなインメモリキュー（ジョブの状態はリクエスト間で共有されないように、ここではOK）
_jobs: Dict[str, Dict] = {}


# ★修正点: フロントエンドから last_prompt を受け取る
class JobCreateBody(BaseModel):
    prompt: Optional[str] = None
    duration: int = 15
    bpm: Optional[int] = None
    hr: Optional[int] = None
    intensity: Optional[float] = None
    last_prompt: Optional[str] = None # 追加


@router.post("/music-jobs")
async def create_job(body: JobCreateBody):
    job_id = uuid.uuid4().hex
    _jobs[job_id] = {"status": "queue"}
    asyncio.create_task(_run_job(job_id, body))
    return {"job_id": job_id}


async def _run_job(job_id: str, body: JobCreateBody):
    # ★修正点: global宣言を削除
    # global FIRST_USER_PROMPT, LAST_PROMPT, LAST_BPM, LAST_HR, LAST_INTENSITY
    try:
        _jobs[job_id]["status"] = "running"

        # ★修正点: `last_prompt` を引数で渡し、グローバル変数への依存をなくす
        effective_prompt = build_prompt(
            user_prompt=body.prompt,
            hr=body.hr,
            intensity=body.intensity,
            prev_bpm=body.bpm,
            last_prompt=body.last_prompt, # 修正
            duration=body.duration,
            job_id=job_id
        )

        wav_np = await asyncio.to_thread(generate_wav_np, effective_prompt, body.duration)
        url, bpm_est = await asyncio.to_thread(save_wav_and_estimate_bpm, wav_np)

        log_prompt(
            effective_prompt,
            src="job_done",
            hr=body.hr,
            intensity=body.intensity,
            bpm=bpm_est,
            duration=body.duration,
            job_id=job_id,
        )

        # ★修正点: グローバル変数への代入をすべて削除
        # if body.prompt and body.prompt.strip():
        #     FIRST_USER_PROMPT = FIRST_USER_PROMPT or body.prompt.strip()
        # LAST_PROMPT = effective_prompt
        # LAST_BPM = bpm_est
        # LAST_HR = body.hr
        # LAST_INTENSITY = body.intensity

        _jobs[job_id] = {
            "status": "done",
            "url": url,
            "bpm": bpm_est,
            "prompt": effective_prompt,
        }
    except Exception as e:
        # エラーログをより詳細に出力
        import traceback
        print(f"Job {job_id} failed: {e}")
        traceback.print_exc()
        _jobs[job_id] = {"status": "error", "error": str(e)}


@router.get("/music-jobs/{job_id}")
async def job_status(job_id: str):
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    return job
