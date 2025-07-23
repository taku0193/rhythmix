# app/musicgen_router.py
import io
from typing import Optional

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from .music_prompt_utils import (
    SAMPLING_RATE,
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


class MusicPrompt(BaseModel):
    prompt: Optional[str] = None
    duration: int = 15
    bpm: Optional[int] = None
    hr: Optional[int] = None
    intensity: Optional[float] = None


class MusicGenRequest(BaseModel):
    prompt: str
    duration: int = 8


@router.post("/generate-bgm")
async def generate_bgm(body: MusicPrompt, request: Request):
    global FIRST_USER_PROMPT, LAST_PROMPT, LAST_BPM, LAST_HR, LAST_INTENSITY
    try:
        effective_prompt = build_prompt(
            user_prompt=body.prompt,
            hr=body.hr,
            intensity=body.intensity,
            prev_bpm=body.bpm or LAST_BPM,
            prev_prompt=LAST_PROMPT,
            first_user_prompt=FIRST_USER_PROMPT,
        )

        wav_np = generate_wav_np(effective_prompt, body.duration)
        url, bpm_est = save_wav_and_estimate_bpm(wav_np)

        if body.prompt and body.prompt.strip():
            FIRST_USER_PROMPT = FIRST_USER_PROMPT or body.prompt.strip()

        LAST_PROMPT = effective_prompt
        LAST_BPM = bpm_est
        LAST_HR = body.hr
        LAST_INTENSITY = body.intensity

        return JSONResponse(
            status_code=200,
            content={"success": True, "url": url, "bpm": bpm_est, "prompt": effective_prompt},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation failed: {e}")


@router.post("/generate-music")
async def generate_music(req: MusicGenRequest):
    try:
        wav_np = generate_wav_np(req.prompt, req.duration)
        buf = io.BytesIO()
        import scipy.io.wavfile
        scipy.io.wavfile.write(buf, SAMPLING_RATE, wav_np)
        buf.seek(0)
        return StreamingResponse(buf, media_type="audio/wav")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation failed: {e}")
