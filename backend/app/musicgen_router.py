# app/musicgen_router.py
import io
from typing import Optional

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

# ★修正点: グローバル変数に依存しなくなったため、関連インポートを整理
from .music_prompt_utils import (
    SAMPLING_RATE,
    generate_wav_np,
)

router = APIRouter()


class MusicGenRequest(BaseModel):
    prompt: str
    duration: int = 8


# ★修正点: 古い同期APIエンドポイントを無効化
# このエンドポイントはグローバル変数に依存しており、ステートレスな設計に反するため廃止されました。
# 今後は /api/music-jobs を使用してください。
#
# class MusicPrompt(BaseModel):
#     prompt: Optional[str] = None
#     duration: int = 15
#     bpm: Optional[int] = None
#     hr: Optional[int] = None
#     intensity: Optional[float] = None
#
# @router.post("/generate-bgm")
# async def generate_bgm(body: MusicPrompt, request: Request):
#     # ... (古いコード全体をコメントアウトまたは削除)
#     pass


@router.post("/generate-music")
async def generate_music(req: MusicGenRequest):
    """
    シンプルなプロンプトから直接音楽を生成するテスト用エンドポイント。
    アプリケーションのメインフローでは使用されません。
    """
    try:
        wav_np = generate_wav_np(req.prompt, req.duration)
        buf = io.BytesIO()
        import scipy.io.wavfile
        scipy.io.wavfile.write(buf, SAMPLING_RATE, wav_np)
        buf.seek(0)
        return StreamingResponse(buf, media_type="audio/wav")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation failed: {e}")
