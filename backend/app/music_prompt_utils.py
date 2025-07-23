# backend/app/music_prompt_utils.py
from typing import Optional, Tuple
import uuid
import os
from pathlib import Path

import numpy as np
import scipy.io.wavfile
import librosa
import torch
from transformers import AutoProcessor, MusicgenForConditionalGeneration

from .prompt_logger import log_prompt

# ========= モデル共有 =========
_device = "cuda" if torch.cuda.is_available() else "cpu"

_processor = AutoProcessor.from_pretrained("facebook/musicgen-large")
_model = MusicgenForConditionalGeneration.from_pretrained(
    "facebook/musicgen-large",
    attn_implementation="eager",
    torch_dtype=torch.float16 if _device.startswith("cuda") else torch.float32,
    low_cpu_mem_usage=True,
).to(_device)

SAMPLING_RATE = _model.config.audio_encoder.sampling_rate

# ========= 保存先 =========
BASE_DIR = Path(__file__).resolve().parents[1]          # backend/
AUDIO_DIR = BASE_DIR / "static" / "audio"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

# ★修正点: 状態を保持するグローバル変数をすべて削除
# FIRST_USER_PROMPT: Optional[str] = None
# LAST_PROMPT: Optional[str] = None
# LAST_BPM: Optional[int] = None
# LAST_HR: Optional[int] = None
# LAST_INTENSITY: Optional[float] = None


# ========= Core functions =========
def generate_wav_np(prompt: str, duration: int) -> np.ndarray:
    safe_duration = min(duration, 30)
    # MusicGen v3.7から `max_new_tokens` は非推奨になったため、 `do_sample` を使う
    # max_new_tokens = int(safe_duration * 50) 
    guidance_scale = 3.0 # プロンプトへの忠実度

    inputs = _processor(text=[prompt], padding=True, return_tensors="pt").to(_device)
    
    # 生成するトークン数を計算 (duration * sampling_rate / model_hop_length)
    # MusicGen Largeのhop_lengthは50
    max_new_tokens = int(safe_duration * _model.config.audio_encoder.sampling_rate / 50)

    audio_values = _model.generate(
        **inputs, 
        do_sample=True, 
        guidance_scale=guidance_scale, 
        max_new_tokens=max_new_tokens
    )
    wav_np = audio_values[0, 0].cpu().numpy()
    if wav_np.dtype == np.float16:
        wav_np = wav_np.astype(np.float32)
    return wav_np


def save_wav_and_estimate_bpm(wav_np: np.ndarray) -> Tuple[str, int]:
    fname = f"bgm_{uuid.uuid4().hex}.wav"
    fpath = AUDIO_DIR / fname
    scipy.io.wavfile.write(fpath, SAMPLING_RATE, wav_np)

    y, sr = librosa.load(str(fpath), sr=SAMPLING_RATE)
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    bpm_est = int(round(float(tempo))) if np.isfinite(tempo) else 120
    return f"/static/audio/{fname}", bpm_est


def pick_mood(hr: Optional[int], intensity: Optional[float]) -> str:
    if intensity is not None:
        if intensity >= 0.8:
            return "very high-energy, aggressive rhythm, heavy drums"
        if intensity >= 0.5:
            return "upbeat, driving beat, bright synths"
        if intensity <= 0.2:
            return "chill, soft pads, minimal percussion"
        return "moderately upbeat, catchy melody"

    if hr is not None:
        if hr >= 140:
            return "very high-energy, aggressive rhythm, heavy drums"
        if hr >= 120:
            return "upbeat, driving beat, bright synths"
        if hr <= 90:
            return "calm and relaxed, soft pads, minimal percussion"
        return "moderately upbeat, catchy melody"

    return "moderately upbeat, catchy melody"


def build_prompt(
    user_prompt: Optional[str],
    hr: Optional[int],
    intensity: Optional[float],
    prev_bpm: Optional[int],
    # ★修正点: 引数名を `prev_prompt` から `last_prompt` に変更して分かりやすくする
    last_prompt: Optional[str],
    # ★修正点: first_user_prompt はクライアント側で管理・送信される想定だったが、
    # シンプルにするため last_prompt からの連続性を重視するロジックに変更
    duration: Optional[int] = None,
    job_id: Optional[str] = None,
) -> str:
    """
    実際に使用するプロンプトを決める。
    ログは log_prompt() に一本化。
    """
    # ユーザー指定があれば最優先
    if user_prompt and user_prompt.strip():
        prompt_out = user_prompt.strip()
        log_prompt(
            prompt_out,
            src="user_direct",
            hr=hr,
            intensity=intensity,
            bpm=prev_bpm,
            duration=duration,
            job_id=job_id,
        )
        return prompt_out

    # 自動生成
    # ★修正点: last_prompt を使って連続性のあるプロンプトを生成
    if last_prompt:
        base_style = f"{last_prompt}, continuous mix, seamless transition"
    else:
        base_style = "energetic electronic track"


    mood = pick_mood(hr, intensity)
    bpm_hint = f", tempo near {prev_bpm} BPM" if prev_bpm else ""
    prompt_out = f"{base_style}, {mood}{bpm_hint}, clean mix, no vocals"

    log_prompt(
        prompt_out,
        src="auto_build",
        hr=hr,
        intensity=intensity,
        bpm=prev_bpm,
        duration=duration,
        job_id=job_id,
    )
    return prompt_out
