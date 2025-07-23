from fastapi import APIRouter, UploadFile, File
from moviepy.video.io.VideoFileClip import VideoFileClip
import numpy as np
from app.mediapipe_processor import extract_skeleton_sequence

router = APIRouter()

@router.post("/infer_tempo_by_events")
async def infer_tempo_by_events(
    video: UploadFile = File(...),
    target_keypoint: str = "right_wrist",
    threshold: float = 0.1
):
    tmp_path = f"/tmp/{video.filename}"
    with open(tmp_path, "wb") as f:
        f.write(await video.read())

    clip = VideoFileClip(tmp_path)
    fps = clip.fps

    sequence = extract_skeleton_sequence(tmp_path)
    target_pos = (0.5, 0.5)
    times = []
    for i, pose in enumerate(sequence):
        if target_keypoint in pose:
            x, y = pose[target_keypoint]
            if np.hypot(x - target_pos[0], y - target_pos[1]) < threshold:
                times.append(i / fps)
    if len(times) < 2:
        return {"bpm": None, "message": "Not enough events"}

    intervals = np.diff(times)
    bpm = int(round(60 / intervals.mean()))
    return {"bpm": bpm, "events": times, "intervals": intervals.tolist()}