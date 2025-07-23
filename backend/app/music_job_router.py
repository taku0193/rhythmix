# app/music_job_router.py
import asyncio
import uuid
from typing import Dict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from .prompt_logger import log_prompt 

from .music_prompt_utils import (
    generate_wav_np,
    save_wav_and_estimate_bpm,
    build_prompt,
    FIRST_USER_PROMPT,
    LAST_PROMPT,
    LAST_BPM,
    LAST_HR,
    LAST_INTENSITY,
)

router = APIRouter()

# シンプルなインメモリキュー
_jobs: Dict[str, Dict] = {}


class JobCreateBody(BaseModel):
    prompt: str | None = None
    duration: int = 15
    bpm: int | None = None
    hr: int | None = None
    intensity: float | None = None


@router.post("/music-jobs")
async def create_job(body: JobCreateBody):
    job_id = uuid.uuid4().hex
    _jobs[job_id] = {"status": "queue"}
    asyncio.create_task(_run_job(job_id, body))
    return {"job_id": job_id}


async def _run_job(job_id: str, body: JobCreateBody):
    global FIRST_USER_PROMPT, LAST_PROMPT, LAST_BPM, LAST_HR, LAST_INTENSITY
    try:
        _jobs[job_id]["status"] = "running"

        effective_prompt = build_prompt(
            user_prompt=body.prompt,
            hr=body.hr,
            intensity=body.intensity,
            prev_bpm=body.bpm or LAST_BPM,
            prev_prompt=LAST_PROMPT,
            first_user_prompt=FIRST_USER_PROMPT,
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

        if body.prompt and body.prompt.strip():
            FIRST_USER_PROMPT = FIRST_USER_PROMPT or body.prompt.strip()
        LAST_PROMPT = effective_prompt
        LAST_BPM = bpm_est
        LAST_HR = body.hr
        LAST_INTENSITY = body.intensity

        _jobs[job_id] = {
            "status": "done",
            "url": url,
            "bpm": bpm_est,
            "prompt": effective_prompt,
        }
    except Exception as e:
        _jobs[job_id] = {"status": "error", "error": str(e)}


@router.get("/music-jobs/{job_id}")
async def job_status(job_id: str):
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    return job
