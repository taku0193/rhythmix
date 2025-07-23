# backend/app/musicgen_router.py

import os
import uuid
import io
import torch
import scipy.io.wavfile
import librosa

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from transformers import AutoProcessor, MusicgenForConditionalGeneration

router = APIRouter()

# 出力先ディレクトリの作成
os.makedirs("static/audio", exist_ok=True)

# デバイス設定とモデル・プロセッサのロード
device = "cuda" if torch.cuda.is_available() else "cpu"
processor = AutoProcessor.from_pretrained("facebook/musicgen-large")
model = MusicgenForConditionalGeneration.from_pretrained(
    "facebook/musicgen-large",
    attn_implementation="eager"
).to(device)

class MusicPrompt(BaseModel):
    prompt: str
    duration: int = 15  # 秒

@router.post("/generate-music")
async def generate_music(music_prompt: MusicPrompt, request: Request):
    """
    POST /api/generate-music
    {
      "prompt": "upbeat workout track",
      "duration": 20
    }
    → { "success": true, "url": "...", "bpm": 123 }
    """
    try:
        # 長さを最大30秒までに制限
        safe_duration = min(music_prompt.duration, 30)
        # トークン数の目安（秒×50）
        max_new_tokens = int(safe_duration * 50)

        # テキストをモデル用にエンコード
        inputs = processor(
            text=[music_prompt.prompt],
            padding=True,
            return_tensors="pt",
        ).to(device)

        # 生成実行
        audio_values = model.generate(**inputs, max_new_tokens=max_new_tokens)
        # (batch, channel, time) → NumPy
        wav_np = audio_values[0, 0].cpu().numpy()

        # ファイル名・パスの準備
        sampling_rate = model.config.audio_encoder.sampling_rate
        unique_id = uuid.uuid4().hex
        fname = f"bgm_{unique_id}.wav"
        out_dir = os.path.join("static", "audio")
        path = os.path.join(out_dir, fname)

        # WAVとして書き出し
        scipy.io.wavfile.write(path, sampling_rate, wav_np)

        # LibrosaでBPMを解析
        y, sr = librosa.load(path, sr=sampling_rate)
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        bpm_est = int(round(float(tempo)))

        # クライアント向けURL生成
        base_url = str(request.base_url).rstrip("/")
        file_url = f"{base_url}/static/audio/{fname}"

        return {"success": True, "url": file_url, "bpm": bpm_est}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation failed: {e}")
